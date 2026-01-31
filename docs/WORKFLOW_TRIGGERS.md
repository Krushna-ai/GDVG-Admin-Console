# GitHub Actions Workflow Trigger Setup

## Required Environment Variables

To enable manual workflow triggers from the admin dashboard, you need to set up the following environment variables:

### 1. GitHub Personal Access Token

Create a GitHub Personal Access Token with `workflow` scope:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name: `GDVG Admin Console - Workflow Triggers`
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. Click "Generate token"
6. Copy the token (you won't be able to see it again!)

### 2. Add to Environment Variables

**For local development (.env.local):**
```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REPO_OWNER=Krushna-ai
GITHUB_REPO_NAME=GDVG-Admin-Console
```

**For Vercel deployment:**
1. Go to Vercel dashboard → Your project → Settings → Environment Variables
2. Add the following:
   - Name: `GITHUB_TOKEN`, Value: `ghp_xxx...`
   - Name: `GITHUB_REPO_OWNER`, Value: `Krushna-ai`
   - Name: `GITHUB_REPO_NAME`, Value: `GDVG-Admin-Console`

### 3. Supported Workflows

The trigger API supports the following workflows:
- `enrich-content` → Enrich Content Data workflow
- `enrich-people` → Enrich People Data workflow
- `data-quality` → Data Quality Validation workflow

### 4. API Usage

**Endpoint:** `POST /api/workflows/trigger`

**Request Body:**
```json
{
  "workflow": "enrich-content"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Workflow 'enrich-content' triggered successfully",
  "workflow": "enrich-content.yml"
}
```

### 5. Security Notes

- The GitHub token has full access to your repository - keep it secure!
- Only authenticated admin users can trigger workflows
- Never commit tokens to version control
- Rotate tokens periodically for security
