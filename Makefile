.PHONY: help dev build fmt fmt-check lint check test ci release release-retry tag-delete

# CalVer: YYYY.M.D
CALVER := $(shell date '+%Y.%-m.%-d')
# Get current version from package.json
VERSION := $(shell node -p "require('./package.json').version")
# Get latest tag
LATEST_TAG := $(shell git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Start development server
	npm run tauri:dev

build: ## Build the application
	npm run tauri:build

# CI/Linting targets

fmt: ## Format code with cargo fmt
	cd src-tauri && cargo fmt

fmt-check: ## Check code formatting (same as CI)
	cd src-tauri && cargo fmt -- --check

lint: ## Run clippy with warnings as errors (same as CI)
	cd src-tauri && cargo clippy -- -D warnings

check: ## Run cargo check (fast compilation check)
	cd src-tauri && cargo check

test: ## Run cargo tests
	cd src-tauri && cargo test

ci: fmt-check lint test ## Run all CI checks locally (fmt + lint + test)

# Release management (CalVer: YYYY.M.D)

release: ## Create a release using today's date as version
	@if [ "$(VERSION)" = "$(CALVER)" ]; then \
		echo "Version $(CALVER) is already set. Use 'make release-retry' to re-tag."; \
		exit 1; \
	fi
	@echo "Releasing v$(CALVER)..."
	@sed -i 's/"version": "[^"]*"/"version": "$(CALVER)"/' package.json && \
	sed -i 's/"version": "[^"]*"/"version": "$(CALVER)"/' src-tauri/tauri.conf.json && \
	sed -i 's/^version = "[^"]*"/version = "$(CALVER)"/' src-tauri/Cargo.toml && \
	npm install --package-lock-only && \
	cd src-tauri && cargo update -p clai && cd .. && \
	git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json && \
	git commit -m "Release v$(CALVER)" && \
	git tag "v$(CALVER)" && \
	git push && git push --tags && \
	echo "✓ Released v$(CALVER)"

release-retry: ## Retry the last release (recreate same tag)
	@echo "Retrying release $(LATEST_TAG)..."
	git tag -d $(LATEST_TAG) 2>/dev/null || true
	git push origin :$(LATEST_TAG) 2>/dev/null || true
	git tag $(LATEST_TAG)
	git push --tags
	@echo "✓ Tag $(LATEST_TAG) recreated and pushed"

tag-delete: ## Delete a tag locally and remotely (usage: make tag-delete TAG=v0.1.0)
	@if [ -z "$(TAG)" ]; then echo "Usage: make tag-delete TAG=v0.1.0"; exit 1; fi
	git tag -d $(TAG) 2>/dev/null || true
	git push origin :$(TAG) 2>/dev/null || true
	@echo "✓ Tag $(TAG) deleted"

# Key management

show-signing-key: ## Show the decoded signing key (for GitHub secret)
	@echo "Copy this to TAURI_SIGNING_PRIVATE_KEY secret:"
	@echo "---"
	@base64 -d ~/.tauri/clai.key
	@echo ""
	@echo "---"

generate-signing-key: ## Generate new signing keys
	rm -f ~/.tauri/clai.key ~/.tauri/clai.key.pub
	npm run tauri signer generate -- -w ~/.tauri/clai.key
	@echo ""
	@echo "Update tauri.conf.json pubkey with:"
	@cat ~/.tauri/clai.key.pub
