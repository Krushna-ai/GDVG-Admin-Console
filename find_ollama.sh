#!/bin/bash
python3 -c "import bigdl.cpp, os; d=os.path.dirname(bigdl.cpp.__file__); print('BIGDL_DIR:', d)"
ls /usr/local/lib/python3.11/dist-packages/bigdl/cpp/libs/ollama/ 2>/dev/null || echo "libs/ollama not found at that path"
find / -maxdepth 12 -name "ollama" -type f 2>/dev/null
