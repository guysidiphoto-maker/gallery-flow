#!/bin/bash
set -e

echo "── GalleryFlow Setup ──────────────────────"

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "Node.js not found."
  if command -v brew &>/dev/null; then
    echo "Installing Node.js via Homebrew..."
    brew install node
  else
    echo ""
    echo "Please install Node.js first:"
    echo "  brew install node"
    echo "  — or — download from https://nodejs.org"
    exit 1
  fi
fi

echo "Node.js: $(node --version)"
echo "npm:     $(npm --version)"

echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "Done! Run the app with:"
echo "  npm run dev"
