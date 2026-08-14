NAME := $(shell node -p "require('./package.json').name")
VERSION := $(shell node -p "require('./package.json').version")
VSIX := $(NAME)-$(VERSION).vsix

.PHONY: build install clean

build:
	npm install --no-audit --no-fund
	npm run compile
	npm run package
	@echo "Built $(VSIX)"

install: build
	npx vscode-hacker-meta install $(VSIX)

clean:
	rm -f $(VSIX)
	rm -rf out
