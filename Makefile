.DEFAULT_GOAL := help

help:
	@echo ""
	@echo "PDF Assembly Tool"
	@echo "================="
	@echo ""
	@echo "First-time setup (run once, from THIS directory):"
	@echo "  make install    Install dependencies"
	@echo "  make build      Build the app"
	@echo ""
	@echo "Usage (run from the folder that contains your PDFs/images):"
	@echo "  cd /path/to/your/files"
	@echo "  /path/to/$(notdir $(CURDIR))/run              # port 3001"
	@echo "  /path/to/$(notdir $(CURDIR))/run --port 4567  # custom port"
	@echo ""
	@echo "Then open http://localhost:3001 in your browser."
	@echo "(The server opens it automatically.)"
	@echo ""
	@echo "Prefer the terminal? Use the TUI instead of the browser:"
	@echo "  cd /path/to/your/files"
	@echo "  /path/to/$(notdir $(CURDIR))/tui-run"
	@echo ""
	@echo "Development (only needed if modifying this tool):"
	@echo "  make dev        Hot-reload dev server on http://localhost:5173"
	@echo "  make tui        Print how to launch the terminal UI on your files"
	@echo ""

install:
	npm install

build:
	npm run build

dev:
	npm run dev

tui:
	@echo ""
	@echo "Run the TUI from the folder that holds your PDFs/images:"
	@echo ""
	@echo "  cd /path/to/your/files"
	@echo "  $(CURDIR)/tui-run"
	@echo ""
	@echo "Tip: symlink it onto your PATH for a short command you can run anywhere:"
	@echo "  ln -s $(CURDIR)/tui-run ~/bin/pdf-tui"
	@echo "  cd /path/to/your/files && pdf-tui"
	@echo ""

.PHONY: help install build dev tui
