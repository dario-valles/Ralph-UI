# Deploying Ralph UI Website to Cloudflare Pages

## Quick Deploy (Recommended)

### Option 1: Direct GitHub Integration (Easiest)

1. **Push your changes to GitHub:**
   ```bash
   git push origin main
   ```

2. **Go to Cloudflare Dashboard:**
   - Login to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to: **Workers & Pages** → **Create application**
   - Select **Pages** tab

3. **Connect your GitHub repository:**
   - Click "Connect to Git"
   - Select GitHub and authorize Cloudflare
   - Choose `dario-valles/Ralph-UI` repository
   - Select `main` branch

4. **Configure build settings:**
   ```yaml
   Build command: (leave empty for static sites)
   Build output directory: website
   Root directory: (leave empty)
   ```

   Since this is a static site with no build process:
   - **Build command:** Leave empty
   **Build output directory:** `website`
   **Root directory:** `/`
   - **Environment variables:** (none needed)

5. **Deploy:**
   - Click "Save and Deploy"
   - Cloudflare will deploy your site
   - Get your URL: `https://ralph-ui.pages.dev`

### Option 2: Wrangler CLI (Advanced)

1. **Install Wrangler:**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare:**
   ```bash
   wrangler login
   ```

3. **Create Pages project:**
   ```bash
   cd website
   wrangler pages deploy . --project-name=ralph-ui
   ```

## Configuration Files (Optional)

### Create `_redirects` file (for clean URLs):

```bash
cd website
cat > _redirects << 'EOF'
# Redirect old URLs if needed
/old-path /new-path 301
EOF
```

### Create `_headers` file (for custom headers):

```bash
cat > _headers <<'EOF'
# Cache static assets
/assets/* Cache-Control: public, max-age=31536000, immutable

/index.html Cache-Control: public, max-age=0, must-revalidate
EOF
```

## Custom Domain (Optional)

1. **In Cloudflare Dashboard:**
   - Go to your Pages project
   - Click "Custom domains"
   - Add your domain (e.g., `ralphui.com` or `demo.ralphui.com`)

2. **Update DNS:**
   - Cloudflare will give you DNS records
   - Add them to your domain registrar
   - Wait for DNS propagation (minutes to hours)

3. **SSL Certificate:**
   - Cloudflare automatically provisions SSL
   - HTTPS enabled automatically

## Pre-Deployment Checklist

Before deploying, ensure:

- [ ] All changes committed to git
- [ ] `website/index.html` has latest changes
- [ ] `website/styles.css` includes demo section
- [ ] `website/script.js` has video controls
- [ ] `website/assets/demo_video.mp4` exists
- [ ] Test website locally: `cd website && python3 -m http.server 8080`
- [ ] Check all links work
- [ ] Verify video plays correctly
- [ ] Test on mobile viewport (Chrome DevTools device mode)

## Post-Deployment Verification

1. **Check your site:**
   - Visit `https://ralph-ui.pages.dev`
   - Verify all sections load
   - Test demo video playback
   - Check mobile responsiveness

2. **Test video functionality:**
   - Autoplay works (muted)
   - Play/pause buttons work
   - Mute/unmute toggles
   - Fullscreen works
   - Video loops correctly

3. **Check all sections:**
   - Hero section displays
   - Demo video section visible
   - Agents grid shows all 7 agents
   - Providers section displays
   - Features section loads
   - Quick start section appears

## Updating the Site

After making changes:

```bash
git add .
git commit -m "update: description of changes"
git push
```

Cloudflare Pages will auto-deploy on push (if enabled in settings).

## Performance Optimization

Cloudflare automatically:
- Minifies HTML/CSS/JS
- Optimizes images
- CDN caching across 200+ locations
- HTTP/3 support
- Brotli compression

## Monitoring

- **Analytics:** Cloudflare Web Analytics (built-in)
- **Deploy logs:** Cloudflare Dashboard → Pages → Your project → Logs
- **Rollbacks:** Dashboard → Deployments → Rollback

## Alternative: Cloudflare Workers (If Needed)

For advanced features (API routes, server-side logic):

```javascript
// worker.js
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return Response.redirect('https://your-domain.com/index.html', 301);
    }

    // Serve static files
    return env.ASSETS.fetch(request);
  }
}
```

## Troubleshooting

### Video won't autoplay:
- Browsers block unmuted autoplay
- Video must be `muted` attribute
- Ensure `playsinline` attribute for iOS

### Video controls don't appear:
- Hover over video area
- Check browser console for errors
- Ensure script.js loaded correctly

### Styles not loading:
- Clear browser cache
- Check styles.css path in HTML
- Verify CSS committed to git

### Site not updating:
- Check Cloudflare deployment logs
- Verify git push succeeded
- May take 1-2 minutes for new deployment

## Production Tips

1. **Enable Preview deployments:**
   - Test changes on preview URL before production
   - Rollback instantly if issues found

2. **Set up branch deployments:**
   - `main` → production
   - `dev` → preview

3. **Analytics:**
   - Enable Cloudflare Web Analytics
   - Track video engagement
   - Monitor page performance

4. **Domain:**
   - Use custom domain for branding
   - Enable SSL automatically

## Current Status

Your website is ready to deploy with:
- ✅ Latest demo video section
- ✅ All styling complete
- ✅ Video controls implemented
- ✅ Responsive design
- ✅ All 7 agents documented
- ✅ Provider section added
- ✅ "Ralph Wiggum On Steroids" branding

Just push and deploy! 🚀
