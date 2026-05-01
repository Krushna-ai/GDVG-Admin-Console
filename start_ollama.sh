#!/bin/bash
set -e
llm_dir="$(python3 -c "import bigdl.cpp, os; print(os.path.dirname(bigdl.cpp.__file__))")"
lib_dir="$llm_dir/libs/ollama"
# Symlink all needed libs into current dir so the binary can find them
ln -sf "${lib_dir}"/* /usr/local/bin/ 2>/dev/null || true
export PATH="$lib_dir:$PATH"
exec "$lib_dir/ollama" serve
