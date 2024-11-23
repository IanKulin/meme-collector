# meme-collect

Web app for downloading images from `meme-ingester`

## to build & run for testing
- Native `node server.js`
or
- `docker build -t ghcr.io/iankulin/meme-collector .`
- `docker compose up`
- http://127.0.0.1:3000

## to build and push for production
- `docker build --platform linux/amd64 -t ghcr.io/iankulin/meme-collector .`
- `docker push ghcr.io/iankulin/meme-collector`