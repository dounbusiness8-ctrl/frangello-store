# Frangello Store

Simple Node.js + Express storefront with an admin panel.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

App URLs:

- Store: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

## Deploy on Vercel

This project is prepared for Vercel using:

- `api/index.js` as the Vercel function entry
- `vercel.json` rewrites for `/api/*`, `/admin`, `/product/:id`, and `/health`
- Vercel Blob for persistent storage in production

### 1. Push this project to GitHub

Create a GitHub repo and upload the project.

### 2. Import the repo in Vercel

In the Vercel dashboard:

1. Click `Add New...`
2. Choose `Project`
3. Import the GitHub repository

### 3. Create a Blob store

In the same Vercel project:

1. Open the `Storage` tab
2. Create a new `Blob` store
3. Choose `Private`
4. Attach it to the project environments

Vercel will add the `BLOB_READ_WRITE_TOKEN` environment variable for you.

### 4. Add environment variables

Add these in the Vercel project settings:

- `ADMIN_PASSWORD=your-strong-admin-password`
- `BLOB_PREFIX=frangello`

Optional:

- `DATA_DIR=./data` for local fallback only
- `PORT=3000` for local use only

### 5. Deploy

Vercel will install dependencies and deploy automatically.

### 6. Verify

Open:

- `/`
- `/admin`
- `/health`

The `/health` endpoint should report `"storage": "vercel-blob"` when Blob is configured.

## Important notes

- On Vercel, persistent data should live in Blob storage, not the local filesystem.
- Orders, products, collections, and config are stored as JSON blobs in a private Blob store.
- Change the admin password before exposing the app publicly.

## Local development with Blob

If you want to test Blob locally:

```bash
vercel env pull
```

That will pull `BLOB_READ_WRITE_TOKEN` into your local environment.
