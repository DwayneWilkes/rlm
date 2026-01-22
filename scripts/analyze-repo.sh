#!/bin/bash
# analyze-repo.sh - Run RLM to analyze the repository and identify gaps
# Usage: ./scripts/analyze-repo.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Generate timestamp for this run
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
OUTPUT_DIR="$REPO_ROOT/analysis-runs"
mkdir -p "$OUTPUT_DIR"

OUTPUT_FILE="$OUTPUT_DIR/analysis-$TIMESTAMP.md"
CONTEXT_FILE="$REPO_ROOT/.repo-context.tmp"

echo "Gathering repository context..."

# Build context file with repo structure and key files
{
    echo "=== REPOSITORY STRUCTURE ==="
    echo ""
    echo "Directory tree:"
    find "$REPO_ROOT" -type f \( -name "*.ts" -o -name "*.py" -o -name "*.json" -o -name "*.md" \) \
        ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" \
        | sed "s|$REPO_ROOT/||" | sort

    echo ""
    echo "=== ROOT PACKAGE.JSON ==="
    cat "$REPO_ROOT/package.json"

    echo ""
    echo "=== CLAUDE.MD (Project Guidelines) ==="
    cat "$REPO_ROOT/CLAUDE.md"

    echo ""
    echo "=== CORE PACKAGE (packages/core/package.json) ==="
    cat "$REPO_ROOT/packages/core/package.json"

    echo ""
    echo "=== CLI PACKAGE (packages/cli/package.json) ==="
    cat "$REPO_ROOT/packages/cli/package.json"

    echo ""
    echo "=== CORE TYPES (packages/core/src/types.ts) ==="
    cat "$REPO_ROOT/packages/core/src/types.ts"

    echo ""
    echo "=== CORE INDEX EXPORTS (packages/core/src/index.ts) ==="
    cat "$REPO_ROOT/packages/core/src/index.ts"

    echo ""
    echo "=== CLI INDEX EXPORTS (packages/cli/src/index.ts) ==="
    cat "$REPO_ROOT/packages/cli/src/index.ts"

    echo ""
    echo "=== OPENSPEC CHANGES ==="
    if [ -d "$REPO_ROOT/openspec/changes" ]; then
        for dir in "$REPO_ROOT/openspec/changes"/*/; do
            if [ -d "$dir" ]; then
                echo ""
                echo "--- $(basename "$dir") ---"
                [ -f "$dir/proposal.md" ] && head -50 "$dir/proposal.md"
                [ -f "$dir/tasks.md" ] && echo "" && head -30 "$dir/tasks.md"
            fi
        done
    fi

    echo ""
    echo "=== RECENT GIT HISTORY ==="
    git -C "$REPO_ROOT" log --oneline -20

    echo ""
    echo "=== TEST COVERAGE SUMMARY ==="
    echo "Core tests: $(find "$REPO_ROOT/packages/core" -name "*.test.ts" | wc -l) test files"
    echo "CLI tests: $(find "$REPO_ROOT/packages/cli" -name "*.test.ts" | wc -l) test files"

} > "$CONTEXT_FILE"

echo "Context gathered ($(wc -c < "$CONTEXT_FILE") bytes)"
echo "Running RLM analysis..."

DEBUG_FILE="$OUTPUT_DIR/debug-$TIMESTAMP.log"
JSON_OUTPUT="$OUTPUT_DIR/output-$TIMESTAMP.json"

# Run RLM with the context - use JSON format for clean output extraction
# Capture stderr (debug) to file, stdout (JSON) to another file
node "$REPO_ROOT/packages/cli/dist/bin/rlm.js" run \
    --context "$CONTEXT_FILE" \
    --format json \
    --max-iterations 15 \
    "Analyze this repository comprehensively and create a detailed gap analysis.

Your task is to examine the codebase structure, features, tests, and documentation to identify:

1. **Project Overview**: Summarize what RLM does and its architecture
2. **Completed Features**: List implemented functionality with status
3. **Identified Gaps**: Areas that need work, including:
   - Missing features mentioned in docs but not implemented
   - Missing or incomplete tests
   - Documentation gaps
   - Code quality issues
   - Potential improvements
4. **OpenSpec Proposals**: Status of pending proposals
5. **Technical Debt**: Any shortcuts or temporary solutions
6. **Recommendations**: Prioritized list of suggested next steps

Use the helper functions to verify your findings:
- count_lines() to get accurate file sizes
- find_line() to locate specific code patterns
- search_context() to find mentions of features

Format your output as a well-structured markdown document.
Start with '# RLM Repository Analysis' and include a timestamp.
Be thorough but concise.

IMPORTANT: Store your final markdown in a variable called 'report' and end with FINAL_VAR(report).
Example:
\`\`\`repl
report = '''# RLM Repository Analysis
...your analysis...
'''
\`\`\`
FINAL_VAR(report)" \
    2>"$DEBUG_FILE" > "$JSON_OUTPUT"

# Extract the output field from JSON
# Use cat to handle path normalization on Windows/MINGW
cat "$JSON_OUTPUT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('output', ''))
except Exception as e:
    print(f'Error extracting output: {e}', file=sys.stderr)
    sys.exit(1)
" > "$OUTPUT_FILE"

echo ""
echo "Debug log saved to: $DEBUG_FILE"

# Clean up temp context file only (keep debug and JSON for analysis)
rm -f "$CONTEXT_FILE"

echo ""
echo "============================================"
echo "Analysis complete! Run ID: $TIMESTAMP"
echo "============================================"
echo ""
echo "Output files:"
echo "  Analysis:  $OUTPUT_FILE"
echo "  Debug log: $DEBUG_FILE"
echo "  JSON:      $JSON_OUTPUT"
echo ""
echo "To compare runs: ls -la $OUTPUT_DIR/"
echo ""
echo "Preview:"
head -80 "$OUTPUT_FILE"
