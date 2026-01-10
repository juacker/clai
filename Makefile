.PHONY: help dev build fmt fmt-check lint check test ci release-retry release-patch release-minor release-major tag-delete

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

# Release management

release-retry: ## Retry the last release (recreate same tag)
	@echo "Retrying release $(LATEST_TAG)..."
	git tag -d $(LATEST_TAG) 2>/dev/null || true
	git push origin :$(LATEST_TAG) 2>/dev/null || true
	git tag $(LATEST_TAG)
	git push --tags
	@echo "✓ Tag $(LATEST_TAG) recreated and pushed"

release-patch: ## Create a patch release (0.0.x)
	@$(MAKE) _release TYPE=patch

release-minor: ## Create a minor release (0.x.0)
	@$(MAKE) _release TYPE=minor

release-major: ## Create a major release (x.0.0)
	@$(MAKE) _release TYPE=major

release-beta: ## Create a beta release from current version
	@NEW_TAG="v$(VERSION)-beta"; \
	echo "Creating beta release $$NEW_TAG..."; \
	git tag -d $$NEW_TAG 2>/dev/null || true; \
	git push origin :$$NEW_TAG 2>/dev/null || true; \
	git tag $$NEW_TAG; \
	git push --tags; \
	echo "✓ Tag $$NEW_TAG created and pushed"

_release:
	@echo "Creating $(TYPE) release..."
	@npm version $(TYPE) --no-git-tag-version && \
	NEW_VERSION=$$(node -p "require('./package.json').version") && \
	sed -i 's/"version": "$(VERSION)"/"version": "'$$NEW_VERSION'"/' src-tauri/tauri.conf.json && \
	sed -i 's/^version = "$(VERSION)"/version = "'$$NEW_VERSION'"/' src-tauri/Cargo.toml && \
	git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml && \
	git commit -m "Release v$$NEW_VERSION" && \
	git tag "v$$NEW_VERSION" && \
	git push && git push --tags && \
	echo "✓ Released v$$NEW_VERSION"

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
