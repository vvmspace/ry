#!/bin/bash
mkdir -p $2/Default
cp $1/Default/Cookies $2/Default/Cookies
cp $1/Local\ State $2/Local\ State

if [ $# -eq 4 ]
then
    # rsync from $2 to $3=user@host $4=remote_path using ssh

    rsync -avz -e ssh $2/ $3:$4/

fi