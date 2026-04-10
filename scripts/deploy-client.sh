#!/bin/bash
# Deploy client build script

echo "🚀 Building client..."
cd /var/www/CookieMessenger/messenger/client
npm run build

echo "📦 Copying to deploy..."
rm -rf /var/www/CookieMessenger/deploy/client/dist/*
cp -r dist/* /var/www/CookieMessenger/deploy/client/dist/

echo "🔄 Restarting PM2..."
pm2 restart rlc

echo "✅ Deploy complete!"
