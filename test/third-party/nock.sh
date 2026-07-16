set -e
npm link

NOCK_DIR="./tmp/nock"
NOCK_BRANCH="$1"

if [ -d "$NOCK_DIR" ]; then
  echo "Removing existing $NOCK_DIR directory..."
  rm -rf "$NOCK_DIR"
fi

mkdir -p "$NOCK_DIR"

echo "Cloning at $NOCK_DIR..."
cd "$NOCK_DIR"
git clone https://github.com/nock/nock.git .

if [ -n "$NOCK_BRANCH" ]; then
  echo "Checking out branch $NOCK_BRANCH..."
  git checkout "$NOCK_BRANCH"
fi

echo "Node.js version:"
node -v

echo "Installing dependencies..."
npm ci

echo "Linking @mswjs/interceptors..."
npm link @mswjs/interceptors

echo "Running Nock tests..."
npm test
