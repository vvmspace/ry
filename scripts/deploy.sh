#!/bin/bash

# user_host = USER_HOST from environment variable or .env
# remote_path = REMOTE_PATH from environment variable or .env

user_host=${USER_HOST:-$(cat .env | grep USER_HOST | cut -d "=" -f2)}
remote_path=${REMOTE_PATH:-$(cat .env | grep REMOTE_PATH | cut -d "=" -f2)}

echo "Deploying to $user_host:$remote_path"

ssh $user_host 'cd $remote_path && npm run update'