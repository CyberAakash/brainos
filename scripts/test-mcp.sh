#!/usr/bin/env bash
# Test the BrainOS MCP server by piping JSON-RPC requests via stdin.
# Usage: cd brainos && ./scripts/test-mcp.sh
#
# Prerequisites: cargo build -p brainos-mcp

set -euo pipefail

BINARY="./target/debug/brainos-mcp"

if [ ! -f "$BINARY" ]; then
    echo "Building brainos-mcp..."
    cargo build -p brainos-mcp
fi

echo "=== BrainOS MCP Server Test ==="
echo ""
echo "Sending 6 JSON-RPC requests..."
echo ""

# Pipe all requests at once — the server reads line-by-line and responds to each.
# The 'initialized' notification (no id) should produce no response.
{
    echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}'
    echo '{"jsonrpc":"2.0","method":"initialized","params":{}}'
    echo '{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}'
    echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"brainos_search","arguments":{"query":"architecture decision","limit":3}}}'
    echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"brainos_recent","arguments":{"days":30,"limit":5}}}'
    echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"brainos_projects","arguments":{}}}'
    echo '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"brainos_stats","arguments":{}}}'
    echo '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"brainos_check_duplicate","arguments":{"title":"test capture"}}}'
} | "$BINARY" --allow-write 2>/tmp/brainos-mcp-test.log | while IFS= read -r line; do
    # Parse the id from the response for labeling
    id=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','?'))" 2>/dev/null || echo "?")
    echo "── Response id=$id ──"
    echo "$line" | python3 -m json.tool 2>/dev/null || echo "$line"
    echo ""
done

echo ""
echo "=== Server stderr log ==="
cat /tmp/brainos-mcp-test.log
echo ""
echo "=== Done ==="
