#!/bin/bash
rm full_cv.example.md
cd tmp
git clone git@github.com:vvmspace/cv_builder.git
cp cv_builder/full_cv.example.md ..
rm -rf cv_builder