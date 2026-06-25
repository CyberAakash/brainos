//! Integration tests for brainos-mcp.
//!
//! Spawns `brainos-mcp` as a subprocess with isolated temp dirs,
//! sends JSON-RPC requests over stdin, reads responses from stdout.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use tempfile::TempDir;

// ── Test harness ───────────────────────────────────────────

struct McpHarness {
    child: Child,
    reader: BufReader<std::process::ChildStdout>,
    _data_dir: TempDir,
    _kb_dir: TempDir,
}

impl McpHarness {
    fn start(allow_write: bool) -> Self {
        let data_dir = tempfile::tempdir().expect("create data tmpdir");
        let kb_dir = tempfile::tempdir().expect("create kb tmpdir");

        // Create captures/ inside kb_root so file operations work
        std::fs::create_dir_all(kb_dir.path().join("captures")).unwrap();

        let binary = cargo_bin("brainos-mcp");

        let mut cmd = Command::new(&binary);
        cmd.arg("--data-dir").arg(data_dir.path())
            .arg("--kb").arg(kb_dir.path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        if allow_write {
            cmd.arg("--allow-write");
        }

        let mut child = cmd.spawn()
            .unwrap_or_else(|e| panic!("Failed to spawn {}: {e}", binary.display()));

        let stdout = child.stdout.take().expect("stdout");
        let reader = BufReader::new(stdout);

        McpHarness {
            child,
            reader,
            _data_dir: data_dir,
            _kb_dir: kb_dir,
        }
    }

    /// Send a JSON-RPC request and read the response.
    fn call(&mut self, method: &str, params: Value, id: u64) -> Value {
        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        let stdin = self.child.stdin.as_mut().expect("stdin");
        writeln!(stdin, "{}", serde_json::to_string(&request).unwrap()).unwrap();
        stdin.flush().unwrap();

        let mut line = String::new();
        self.reader.read_line(&mut line).expect("read response");
        serde_json::from_str(line.trim()).expect("parse response JSON")
    }

    /// Send a notification (no response expected).
    fn notify(&mut self, method: &str, params: Value) {
        let request = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        let stdin = self.child.stdin.as_mut().expect("stdin");
        writeln!(stdin, "{}", serde_json::to_string(&request).unwrap()).unwrap();
        stdin.flush().unwrap();
    }

    /// Initialize the MCP session (initialize + initialized).
    fn initialize(&mut self) -> Value {
        let resp = self.call("initialize", json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "test", "version": "0.1.0" }
        }), 0);
        self.notify("initialized", json!({}));
        resp
    }
}

impl Drop for McpHarness {
    fn drop(&mut self) {
        // Close stdin to signal EOF → clean shutdown
        drop(self.child.stdin.take());
        let _ = self.child.wait();
    }
}

/// Find the debug binary built by cargo.
fn cargo_bin(name: &str) -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // crates/
    path.pop(); // project root
    path.push("target");
    path.push("debug");
    path.push(name);
    assert!(path.exists(), "Binary not found at {}. Run `cargo build -p brainos-mcp` first.", path.display());
    path
}

// ── Tests ──────────────────────────────────────────────────

#[test]
fn test_initialize() {
    let mut h = McpHarness::start(false);
    let resp = h.initialize();

    assert_eq!(resp["jsonrpc"], "2.0");
    assert!(resp["error"].is_null());

    let result = &resp["result"];
    assert_eq!(result["protocolVersion"], "2024-11-05");
    assert_eq!(result["serverInfo"]["name"], "brainos-mcp");
}

#[test]
fn test_tools_list_read_only() {
    let mut h = McpHarness::start(false);
    h.initialize();

    let resp = h.call("tools/list", json!({}), 1);
    let tools = resp["result"]["tools"].as_array().expect("tools array");
    let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();

    // Read-only: 6 read tools, no write tools
    assert!(names.contains(&"brainos_search"));
    assert!(names.contains(&"brainos_get"));
    assert!(names.contains(&"brainos_list"));
    assert!(names.contains(&"brainos_recent"));
    assert!(names.contains(&"brainos_projects"));
    assert!(names.contains(&"brainos_stats"));

    assert!(!names.contains(&"brainos_capture"));
    assert!(!names.contains(&"brainos_append"));
    assert!(!names.contains(&"brainos_update"));
    assert!(!names.contains(&"brainos_link"));
}

#[test]
fn test_tools_list_with_write() {
    let mut h = McpHarness::start(true);
    h.initialize();

    let resp = h.call("tools/list", json!({}), 1);
    let tools = resp["result"]["tools"].as_array().expect("tools array");
    let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();

    // All 11 tools
    assert_eq!(names.len(), 11);
    assert!(names.contains(&"brainos_capture"));
    assert!(names.contains(&"brainos_check_duplicate"));
    assert!(names.contains(&"brainos_append"));
    assert!(names.contains(&"brainos_update"));
    assert!(names.contains(&"brainos_link"));
}

#[test]
fn test_write_denied_without_flag() {
    let mut h = McpHarness::start(false);
    h.initialize();

    let resp = h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "Test",
            "body": "Hello"
        }
    }), 1);

    let result = &resp["result"];
    assert_eq!(result["isError"], true);
    let text = result["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("Write access disabled"));
}

#[test]
fn test_capture_create_and_get() {
    let mut h = McpHarness::start(true);
    h.initialize();

    // Create a capture
    let resp = h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "Integration Test Capture",
            "body": "## Context\nTesting the MCP server end-to-end.\n\n## Outcome\nIt works!",
            "type": "learning",
            "space": "work",
            "tags": ["test", "integration"],
            "project": "brainos",
            "mode": "post-hoc"
        }
    }), 1);

    assert!(resp["result"]["isError"].is_null() || resp["result"]["isError"] == false);
    let capture_text: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let capture_id = capture_text["id"].as_str().expect("capture id");
    assert!(!capture_id.is_empty());

    // Get the capture back
    let resp = h.call("tools/call", json!({
        "name": "brainos_get",
        "arguments": { "id": capture_id }
    }), 2);

    let get_text: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    assert_eq!(get_text["title"], "Integration Test Capture");
    assert_eq!(get_text["capture_type"], "learning");
    assert_eq!(get_text["space"], "work");
    assert!(get_text["body_text"].as_str().unwrap().contains("Testing the MCP server"));
}

#[test]
fn test_search() {
    let mut h = McpHarness::start(true);
    h.initialize();

    // Create a capture to search for
    h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "Rust lifetime gotcha with async closures",
            "body": "## Problem\nAsync closures capture references that outlive the borrow.\n\n## Solution\nUse Arc instead of references.",
            "type": "bug-fix",
            "tags": ["rust", "async"],
            "project": "brainos"
        }
    }), 1);

    // Search for it
    let resp = h.call("tools/call", json!({
        "name": "brainos_search",
        "arguments": { "query": "lifetime async closure" }
    }), 2);

    let results: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let arr = results.as_array().expect("search results array");
    assert!(!arr.is_empty(), "search should find the capture");
    assert!(arr[0]["title"].as_str().unwrap().contains("lifetime"));
}

#[test]
fn test_append_section() {
    let mut h = McpHarness::start(true);
    h.initialize();

    // Create
    let resp = h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "Append Test Capture",
            "body": "## Context\nOriginal content.",
            "type": "learning"
        }
    }), 1);

    let capture_text: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let id = capture_text["id"].as_str().unwrap();

    // Append
    let resp = h.call("tools/call", json!({
        "name": "brainos_append",
        "arguments": {
            "id": id,
            "section": "## Follow-up\nAdditional findings after further investigation."
        }
    }), 2);

    let append_text: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    assert_eq!(append_text["message"], "Section appended successfully");

    // Verify the body now contains both sections
    let resp = h.call("tools/call", json!({
        "name": "brainos_get",
        "arguments": { "id": id }
    }), 3);

    let get_text: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let body = get_text["body_text"].as_str().unwrap();
    assert!(body.contains("Original content"), "should keep original");
    assert!(body.contains("Follow-up"), "should have appended section");
    assert!(body.contains("Additional findings"), "should have appended content");
}

#[test]
fn test_update_metadata() {
    let mut h = McpHarness::start(true);
    h.initialize();

    // Create
    let resp = h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "Update Test Capture",
            "body": "## Context\nSome content.",
            "type": "debug",
            "tags": ["initial-tag"]
        }
    }), 1);

    let capture_text: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let id = capture_text["id"].as_str().unwrap();

    // Update metadata
    let resp = h.call("tools/call", json!({
        "name": "brainos_update",
        "arguments": {
            "id": id,
            "status": "resolved",
            "summary": "Fixed the thing",
            "add_tags": ["resolved", "verified"],
            "remove_tags": ["initial-tag"]
        }
    }), 2);

    let update_text: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    assert_eq!(update_text["status"], "resolved");
    assert_eq!(update_text["summary"], "Fixed the thing");

    let tags = update_text["tags"].as_array().unwrap();
    let tag_strs: Vec<&str> = tags.iter().map(|t| t.as_str().unwrap()).collect();
    assert!(tag_strs.contains(&"resolved"));
    assert!(tag_strs.contains(&"verified"));
    assert!(!tag_strs.contains(&"initial-tag"));
}

#[test]
fn test_link_captures() {
    let mut h = McpHarness::start(true);
    h.initialize();

    // Create two captures
    let resp1 = h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "Link Test A",
            "body": "## Context\nFirst capture.",
            "type": "learning"
        }
    }), 1);
    let c1: Value = serde_json::from_str(
        resp1["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let id1 = c1["id"].as_str().unwrap();

    let resp2 = h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "Link Test B",
            "body": "## Context\nSecond capture, related to A.",
            "type": "learning"
        }
    }), 2);
    let c2: Value = serde_json::from_str(
        resp2["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let id2 = c2["id"].as_str().unwrap();

    // Link them
    let resp = h.call("tools/call", json!({
        "name": "brainos_link",
        "arguments": { "id1": id1, "id2": id2 }
    }), 3);

    let link_text: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    assert_eq!(link_text["message"], "Captures linked successfully");

    // Verify bidirectional — A references B
    let resp = h.call("tools/call", json!({
        "name": "brainos_get",
        "arguments": { "id": id1 }
    }), 4);
    let a: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let related_a: Vec<&str> = a["related"].as_array().unwrap()
        .iter().map(|v| v.as_str().unwrap()).collect();
    assert!(related_a.contains(&id2), "A should reference B");

    // B references A
    let resp = h.call("tools/call", json!({
        "name": "brainos_get",
        "arguments": { "id": id2 }
    }), 5);
    let b: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let related_b: Vec<&str> = b["related"].as_array().unwrap()
        .iter().map(|v| v.as_str().unwrap()).collect();
    assert!(related_b.contains(&id1), "B should reference A");
}

#[test]
fn test_check_duplicate() {
    let mut h = McpHarness::start(true);
    h.initialize();

    // Create a capture
    h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "SQLite WAL mode for concurrent reads",
            "body": "## Problem\nNeed concurrent reads from Tauri and MCP.\n\n## Solution\nEnable WAL mode.",
            "type": "decision"
        }
    }), 1);

    // Check duplicate with similar title (use terms that overlap with the capture)
    let resp = h.call("tools/call", json!({
        "name": "brainos_check_duplicate",
        "arguments": {
            "title": "SQLite WAL mode concurrent reads",
            "body": "concurrent reads from Tauri"
        }
    }), 2);

    let dup_text: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    // Should find similar captures
    let similar = dup_text["similar"].as_array().unwrap();
    assert!(!similar.is_empty(), "should find similar capture");
}

#[test]
fn test_stats_and_list() {
    let mut h = McpHarness::start(true);
    h.initialize();

    // Empty KB stats
    let resp = h.call("tools/call", json!({
        "name": "brainos_stats",
        "arguments": {}
    }), 1);

    let stats: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    assert_eq!(stats["total_captures"], 0);

    // Create a capture
    h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "Stats Test",
            "body": "## Test\nContent.",
            "type": "learning",
            "space": "work",
            "project": "test-project"
        }
    }), 2);

    // Stats should now show 1
    let resp = h.call("tools/call", json!({
        "name": "brainos_stats",
        "arguments": {}
    }), 3);

    let stats: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    assert_eq!(stats["total_captures"], 1);

    // List should return the capture
    let resp = h.call("tools/call", json!({
        "name": "brainos_list",
        "arguments": { "project": "test-project" }
    }), 4);

    let list: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let arr = list.as_array().expect("list array");
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["title"], "Stats Test");

    // Projects should list test-project
    let resp = h.call("tools/call", json!({
        "name": "brainos_projects",
        "arguments": {}
    }), 5);

    let projects: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let parr = projects.as_array().expect("projects array");
    assert_eq!(parr.len(), 1);
    assert_eq!(parr[0]["name"], "test-project");
}

#[test]
fn test_unknown_method() {
    let mut h = McpHarness::start(false);
    h.initialize();

    let resp = h.call("nonexistent/method", json!({}), 1);
    assert!(resp["error"].is_object());
    assert_eq!(resp["error"]["code"], -32601);
}

#[test]
fn test_ping() {
    let mut h = McpHarness::start(false);
    h.initialize();

    let resp = h.call("ping", json!({}), 1);
    assert!(resp["error"].is_null());
    assert!(resp["result"].is_object());
}

#[test]
fn test_full_lifecycle() {
    let mut h = McpHarness::start(true);
    h.initialize();

    // 1. Create capture A
    let resp = h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "Lifecycle: Auth Token Caching",
            "body": "## Context\nTokens expire after 1h.\n\n## Decision\nCache in memory with TTL.",
            "type": "decision",
            "tags": ["auth", "caching"],
            "project": "brainos"
        }
    }), 1);
    let c: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let id_a = c["id"].as_str().unwrap().to_string();

    // 2. Create capture B
    let resp = h.call("tools/call", json!({
        "name": "brainos_capture",
        "arguments": {
            "title": "Lifecycle: Token Refresh Bug",
            "body": "## Problem\nRefresh fails when token already expired.\n\n## Fix\nCheck expiry before refresh attempt.",
            "type": "bug-fix",
            "tags": ["auth", "bug"],
            "project": "brainos"
        }
    }), 2);
    let c: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    let id_b = c["id"].as_str().unwrap().to_string();

    // 3. Link A ↔ B
    h.call("tools/call", json!({
        "name": "brainos_link",
        "arguments": { "id1": &id_a, "id2": &id_b }
    }), 3);

    // 4. Append to A
    h.call("tools/call", json!({
        "name": "brainos_append",
        "arguments": {
            "id": &id_a,
            "section": "## Follow-up\nAlso need to handle refresh token rotation."
        }
    }), 4);

    // 5. Update B's status
    h.call("tools/call", json!({
        "name": "brainos_update",
        "arguments": {
            "id": &id_b,
            "status": "resolved",
            "add_tags": ["fixed"]
        }
    }), 5);

    // 6. Search for auth-related captures
    let resp = h.call("tools/call", json!({
        "name": "brainos_search",
        "arguments": { "query": "auth token refresh" }
    }), 6);
    let results: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    assert!(results.as_array().unwrap().len() >= 2, "should find both auth captures");

    // 7. Verify final state of A
    let resp = h.call("tools/call", json!({
        "name": "brainos_get",
        "arguments": { "id": &id_a }
    }), 7);
    let a: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    assert!(a["body_text"].as_str().unwrap().contains("refresh token rotation"));
    assert!(a["related"].as_array().unwrap().iter().any(|v| v.as_str().unwrap() == id_b));

    // 8. Verify final state of B
    let resp = h.call("tools/call", json!({
        "name": "brainos_get",
        "arguments": { "id": &id_b }
    }), 8);
    let b: Value = serde_json::from_str(
        resp["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    assert_eq!(b["status"], "resolved");
    let b_tags: Vec<&str> = b["tags"].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
    assert!(b_tags.contains(&"fixed"));
    assert!(b["related"].as_array().unwrap().iter().any(|v| v.as_str().unwrap() == id_a));
}
