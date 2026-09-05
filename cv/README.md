# CV

This directory contains the LaTeX source for the CV published at
`assets/files/jhha_cv.pdf`.

## Build

```sh
make
```

The compiled PDF is written to `cv/build/main.pdf`.

## Publish to the website

```sh
make publish
```

This recompiles the CV when necessary and copies the result to
`assets/files/jhha_cv.pdf`.

TeX Live with `latexmk` and `pdflatex` is required.
