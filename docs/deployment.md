# Deployment Guide

This guide covers deploying the Motion Library application to a production server.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Server Setup](#server-setup)
3. [Backend Deployment](#backend-deployment)
4. [Frontend Deployment](#frontend-deployment)
5. [Reverse Proxy Configuration](#reverse-proxy-configuration)
6. [SSL/TLS Configuration](#ssltls-configuration)
7. [Process Management](#process-management)
8. [Monitoring and Maintenance](#monitoring-and-maintenance)
9. [Backup and Recovery](#backup-and-recovery)

## System Requirements

### Minimum Requirements

- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB (plus space for models and trajectories)
- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+ / Rocky Linux 8+

### Recommended Requirements

- **CPU**: 4 cores
- **RAM**: 8GB
- **Storage**: 100GB SSD
- **OS**: Ubuntu 22.04 LTS

### Software Requirements

- **Backend**: Python 3.10+, pip, virtualenv
- **Frontend**: Node.js 18+, npm/yarn/pnpm
- **Web Server**: Nginx or Apache
- **Process Manager**: systemd or PM2
- **SSL**: Certbot (Let's Encrypt)

## Server Setup

### 1. Update System Packages

```bash
# Ubuntu/Debian
sudo apt update
sudo apt upgrade -y

# CentOS/Rocky Linux
sudo yum update -y
```

### 2. Install Dependencies

```bash
# Ubuntu/Debian
sudo apt install -y python3.10 python3-pip python3-venv nodejs npm nginx git

# CentOS/Rocky Linux
sudo yum install -y python310 python3-pip nodejs nginx git
```

### 3. Create Application User

```bash
sudo useradd -m -s /bin/bash motion-library
sudo mkdir -p /opt/motion-library
sudo chown motion-library:motion-library /opt/motion-library
```

### 4. Clone Repository

```bash
sudo -u motion-library git clone <your-repo-url> /opt/motion-library
cd /opt/motion-library
```

## Backend Deployment

### 1. Setup Python Environment

```bash
cd /opt/motion-library/backend
sudo -u motion-library python3 -m venv venv
sudo -u motion-library venv/bin/pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create `/opt/motion-library/backend/.env`:

```bash
sudo -u motion-library nano /opt/motion-library/backend/.env
```

Add the following (replace with your values):

```env
# Authentication
SECRET_KEY=<generate-random-secret-key>
PASSWORD=<your-secure-password>
ACCESS_TOKEN_EXPIRE_DAYS=7

# File paths
DATA_DIR=/opt/motion-library/data
MODELS_DIR=/opt/motion-library/data/models
TRAJECTORIES_DIR=/opt/motion-library/data/trajectories
THUMBNAILS_DIR=/opt/motion-library/data/thumbnails

# Server
HOST=127.0.0.1
PORT=8000
```

**Generate a secure SECRET_KEY**:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3. Create Data Directories

```bash
sudo -u motion-library mkdir -p /opt/motion-library/data/{models,trajectories,thumbnails}
```

### 4. Test Backend

```bash
cd /opt/motion-library/backend
sudo -u motion-library venv/bin/python main.py
```

Press `Ctrl+C` to stop once you've verified it starts successfully.

### 5. Create systemd Service

Create `/etc/systemd/system/motion-library-backend.service`:

```ini
[Unit]
Description=Motion Library Backend
After=network.target

[Service]
Type=simple
User=motion-library
Group=motion-library
WorkingDirectory=/opt/motion-library/backend
Environment="PATH=/opt/motion-library/backend/venv/bin"
ExecStart=/opt/motion-library/backend/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable motion-library-backend
sudo systemctl start motion-library-backend
sudo systemctl status motion-library-backend
```

## Frontend Deployment

### 1. Install Dependencies

```bash
cd /opt/motion-library/frontend
sudo -u motion-library npm install
```

### 2. Configure Environment Variables

Create `/opt/motion-library/frontend/.env.production`:

```bash
sudo -u motion-library nano /opt/motion-library/frontend/.env.production
```

Add:

```env
NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

**Note**: Replace `your-domain.com` with your actual domain.

### 3. Build Frontend

```bash
cd /opt/motion-library/frontend
sudo -u motion-library npm run build
```

### 4. Test Production Build

```bash
sudo -u motion-library npm run start
```

Press `Ctrl+C` to stop once verified.

### 5. Create systemd Service

Create `/etc/systemd/system/motion-library-frontend.service`:

```ini
[Unit]
Description=Motion Library Frontend
After=network.target

[Service]
Type=simple
User=motion-library
Group=motion-library
WorkingDirectory=/opt/motion-library/frontend
Environment="PATH=/usr/bin:/usr/local/bin"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable motion-library-frontend
sudo systemctl start motion-library-frontend
sudo systemctl status motion-library-frontend
```

## Reverse Proxy Configuration

### Nginx Configuration

Create `/etc/nginx/sites-available/motion-library`:

```nginx
# Upstream servers
upstream frontend {
    server 127.0.0.1:3000;
}

upstream backend {
    server 127.0.0.1:8000;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL certificates (will be configured by Certbot)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Backend API
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeouts for large file uploads/downloads
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;

        # Increase max body size for file uploads
        client_max_body_size 500M;
    }

    # Frontend application
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|webp|wasm)$ {
        proxy_pass http://frontend;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/motion-library /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Apache Configuration (Alternative)

If using Apache instead of Nginx, create `/etc/apache2/sites-available/motion-library.conf`:

```apache
<VirtualHost *:80>
    ServerName your-domain.com

    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
</VirtualHost>

<VirtualHost *:443>
    ServerName your-domain.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/your-domain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/your-domain.com/privkey.pem

    # Backend API
    ProxyPass /api/ http://127.0.0.1:8000/api/
    ProxyPassReverse /api/ http://127.0.0.1:8000/api/

    # Frontend
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    # Security headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
</VirtualHost>
```

Enable required modules and site:

```bash
sudo a2enmod proxy proxy_http ssl rewrite headers
sudo a2ensite motion-library
sudo systemctl restart apache2
```

## SSL/TLS Configuration

### Install Certbot

```bash
# Ubuntu/Debian
sudo apt install -y certbot python3-certbot-nginx

# CentOS/Rocky Linux
sudo yum install -y certbot python3-certbot-nginx
```

### Obtain SSL Certificate

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Follow the prompts to:
1. Enter your email address
2. Agree to terms of service
3. Choose whether to redirect HTTP to HTTPS (recommended: Yes)

### Auto-renewal

Certbot automatically creates a cron job for renewal. Test it:

```bash
sudo certbot renew --dry-run
```

## Process Management

### Check Service Status

```bash
# Backend
sudo systemctl status motion-library-backend

# Frontend
sudo systemctl status motion-library-frontend
```

### View Logs

```bash
# Backend logs
sudo journalctl -u motion-library-backend -f

# Frontend logs
sudo journalctl -u motion-library-frontend -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Restart Services

```bash
# After code updates
sudo systemctl restart motion-library-backend
sudo systemctl restart motion-library-frontend
sudo systemctl reload nginx
```

## Monitoring and Maintenance

### System Resource Monitoring

Install monitoring tools:

```bash
sudo apt install -y htop iotop nethogs
```

Monitor in real-time:
- `htop` - CPU and memory usage
- `iotop` - Disk I/O
- `nethogs` - Network bandwidth

### Disk Space Monitoring

Check disk usage:

```bash
df -h
du -sh /opt/motion-library/data/*
```

Set up alerts for low disk space:

```bash
# Add to crontab
crontab -e
```

Add:
```cron
0 * * * * /opt/motion-library/scripts/check-disk-space.sh
```

### Log Rotation

Configure log rotation for application logs in `/etc/logrotate.d/motion-library`:

```
/opt/motion-library/backend/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 motion-library motion-library
}
```

### Application Updates

```bash
# Stop services
sudo systemctl stop motion-library-frontend motion-library-backend

# Update code
cd /opt/motion-library
sudo -u motion-library git pull

# Update backend dependencies
cd backend
sudo -u motion-library venv/bin/pip install -r requirements.txt

# Update and rebuild frontend
cd ../frontend
sudo -u motion-library npm install
sudo -u motion-library npm run build

# Start services
sudo systemctl start motion-library-backend motion-library-frontend
```

## Backup and Recovery

### Automated Backup Script

Create `/opt/motion-library/scripts/backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/backup/motion-library"
DATE=$(date +%Y%m%d_%H%M%S)
DATA_DIR="/opt/motion-library/data"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup data directory
tar -czf "$BACKUP_DIR/data_$DATE.tar.gz" "$DATA_DIR"

# Backup configuration
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    /opt/motion-library/backend/.env \
    /opt/motion-library/frontend/.env.production \
    /etc/nginx/sites-available/motion-library \
    /etc/systemd/system/motion-library-*.service

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Make executable and schedule:

```bash
chmod +x /opt/motion-library/scripts/backup.sh
sudo crontab -e
```

Add daily backup at 2 AM:
```cron
0 2 * * * /opt/motion-library/scripts/backup.sh >> /var/log/motion-library-backup.log 2>&1
```

### Remote Backup

For additional safety, sync backups to remote server:

```bash
# Install rsync
sudo apt install -y rsync

# Add to backup script
rsync -avz --delete /backup/motion-library/ user@remote-server:/remote/backup/motion-library/
```

### Restore from Backup

```bash
# Stop services
sudo systemctl stop motion-library-frontend motion-library-backend

# Restore data
sudo tar -xzf /backup/motion-library/data_20250101_020000.tar.gz -C /

# Restore configuration
sudo tar -xzf /backup/motion-library/config_20250101_020000.tar.gz -C /

# Reload systemd
sudo systemctl daemon-reload

# Start services
sudo systemctl start motion-library-backend motion-library-frontend
```

## Security Considerations

### Firewall Configuration

```bash
# Ubuntu/Debian (UFW)
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable

# CentOS/Rocky Linux (firewalld)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### SSH Hardening

Edit `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Restart SSH:
```bash
sudo systemctl restart sshd
```

### Regular Security Updates

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/Rocky Linux
sudo yum update -y
```

Set up automatic security updates:

```bash
# Ubuntu/Debian
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## Troubleshooting

### Service Won't Start

1. Check logs: `sudo journalctl -u motion-library-backend -n 50`
2. Verify environment variables in `.env` files
3. Check file permissions: `ls -la /opt/motion-library`
4. Verify ports are not in use: `sudo netstat -tlnp | grep -E ':(3000|8000)'`

### 502 Bad Gateway

1. Verify backend/frontend services are running
2. Check Nginx configuration: `sudo nginx -t`
3. Review Nginx error logs: `sudo tail -f /var/log/nginx/error.log`

### SSL Certificate Issues

1. Renew certificate: `sudo certbot renew`
2. Check certificate status: `sudo certbot certificates`
3. Verify Nginx SSL configuration

### Performance Issues

1. Check system resources: `htop`, `iotop`
2. Review application logs for errors
3. Consider increasing server resources
4. Optimize data storage (move to SSD, enable compression)

## Production Checklist

Before going live:

- [ ] Change default password in backend `.env`
- [ ] Generate strong SECRET_KEY
- [ ] Configure firewall (only allow ports 22, 80, 443)
- [ ] Enable SSL/TLS with valid certificate
- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Set up monitoring and alerts
- [ ] Test disaster recovery process
- [ ] Document any custom configuration
- [ ] Set up CORS correctly (no wildcards)
- [ ] Review and harden SSH configuration
- [ ] Enable automatic security updates
- [ ] Test all functionality in production environment

## Support

For issues or questions:
- GitHub Issues: <your-repo-url>/issues
- Documentation: /docs/

## Additional Resources

- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
