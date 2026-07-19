# Render Blueprint — lets Render auto-configure this service.
# In Render: New + > Blueprint > connect the repo that contains this folder.
# Render reads this file, builds the Docker image, and asks you for the secret
# values marked "sync: false" (your SMTP password and the app login password).
services:
  - type: web
    name: rrg-ssc-mailer
    runtime: docker
    dockerfilePath: ./Dockerfile
    plan: starter          # ~$7/mo, always-on. Use "free" to trial (sleeps when idle).
    healthCheckPath: /health
    # Persistent disk so the submission log survives restarts and deploys.
    # (Without a disk, Render's filesystem is wiped on every deploy.)
    disk:
      name: rrg-data
      mountPath: /var/data
      sizeGB: 1
    envVars:
      - key: DATA_DIR
        value: /var/data
      - key: CC_ALWAYS
        value: van@rrgcre.com
      - key: MAIL_FROM
        value: van@rrgcre.com
      - key: ALLOW_ORIGIN
        value: "*"
      - key: SMTP_HOST
        value: smtp.gmail.com     # Google Workspace; change if you use another provider
      - key: SMTP_PORT
        value: "587"
      - key: SMTP_SECURE
        value: "false"
      - key: SMTP_USER
        value: van@rrgcre.com
      - key: SMTP_PASS
        sync: false               # Render will prompt you (your 16-char app password)
      - key: APP_USER
        value: rrg
      - key: APP_PASS
        sync: false               # Render will prompt you (the shared login password)
