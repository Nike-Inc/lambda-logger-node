#!/bin/bash

ARTIFACTORY_BASE="https://artifactory.nike.com/artifactory/api/npm"
ARTIFACTORY_USER="maven"
ARTIFACTORY_PASS="ludist"
mv .npmrc .npmrc-temp
curl -u ${ARTIFACTORY_USER}:${ARTIFACTORY_PASS} ${ARTIFACTORY_BASE}/auth > .npmrc
echo "registry=${ARTIFACTORY_BASE}/npm-nike" >> .npmrc
npm publish --registry ${ARTIFACTORY_BASE}/npm-local
rm .npmrc
mv .npmrc-temp .npmrc
