# Local builds, packed. `make` builds the app and keeps the result as builds/<id>-<version>-<commit>-<time>.tgz, so that every
# build can be tried later (the app catalog is tested with them). The same archive is what a release attaches.
#
#   make            build and pack
#   make list       the packed builds, newest first
#   make check      typecheck, lint, tests
#   make push       build, then upload to the bar (on this network, or through the jump host: see tools/bar.sh)
#   make clean      remove dist/ (the packed builds in builds/ stay)

ID      := $(shell jq -er .id src/appmeta/manifest.json)
VERSION := $(shell jq -er .version src/appmeta/manifest.json)
COMMIT  := $(shell git rev-parse --short HEAD 2>/dev/null || echo nogit)$(shell git diff --quiet HEAD 2>/dev/null || echo -dirty)
STAMP   := $(shell date +%Y%m%d-%H%M%S)
ARCHIVE := builds/$(ID)-$(VERSION)-$(COMMIT)-$(STAMP).tgz

.PHONY: all build list check push clean

all: build

build:
	pnpm build --tgz
	mkdir -p builds
	cp dist/$(ID).tgz $(ARCHIVE)
	@echo "packed $(ARCHIVE) ($$(du -h $(ARCHIVE) | cut -f1))"

list:
	@ls -lt builds/*.tgz 2>/dev/null || echo "no packed builds yet: run make"

check:
	pnpm check

push:
	pnpm build
	sh tools/push.sh

clean:
	rm -rf dist
