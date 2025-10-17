set -e
npm link

NOCK_DIR="./tmp/nock"

if [ -d "$NOCK_DIR" ]; then
  echo "Removing existing $NOCK_DIR directory..."
  rm -rf "$NOCK_DIR"
fi

mkdir -p "$NOCK_DIR"

echo "Cloning at $NOCK_DIR..."
cd "$NOCK_DIR"
git clone https://github.com/nock/nock.git .

echo "Installing dependencies..."
npm ci

echo "Linking @mswjs/interceptors..."
npm link @mswjs/interceptors

echo "Running Nock tests..."
npm test
