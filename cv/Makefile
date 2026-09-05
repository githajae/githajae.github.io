LATEXMK ?= latexmk
BUILD_DIR := build
SOURCE := main.tex
BUILT_PDF := $(BUILD_DIR)/main.pdf
PUBLIC_PDF := ../assets/files/jhha_cv.pdf

.PHONY: all publish clean

all: $(BUILT_PDF)

$(BUILT_PDF): $(SOURCE)
	mkdir -p $(BUILD_DIR)
	$(LATEXMK) -pdf -interaction=nonstopmode -halt-on-error -outdir=$(BUILD_DIR) $(SOURCE)

publish: $(BUILT_PDF)
	cp $(BUILT_PDF) $(PUBLIC_PDF)

clean:
	$(LATEXMK) -C -outdir=$(BUILD_DIR) $(SOURCE)
	rm -rf $(BUILD_DIR)
