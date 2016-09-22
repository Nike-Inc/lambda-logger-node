import groovy.json.JsonOutput

node {
    ARTIFACTORY_BASE='http://artifactory.nike.com/artifactory/api/npm'
    ARTIFACTORY_USER='maven'
    ARTIFACTORY_PASS='ludist'

    stage 'Build'
    checkout scm
    try {
      sh "npm install"
      sh "npm run test"
    } catch (err) {
        handleError(err)
    }
    stage 'Publish'
    try {
        sh "curl -u ${ARTIFACTORY_USER}:${ARTIFACTORY_PASS} ${ARTIFACTORY_BASE}/auth > .npmrc"
        sh "echo \"registry=${ARTIFACTORY_BASE}/npm-nike\" >> .npmrc"
        sh "npm publish --registry ${ARTIFACTORY_BASE}/npm-local"
    } catch (err) {
        handleError(err)
    }
}


def handleError(err) {
    notifySlack("Build Failed lambda-node-logger: ${err}")
    echo "Build Failed: ${err}"
    error "build failed: ${err} "
}

def notifySlack(text) {
    def slackURL = 'https://hooks.slack.com/services/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'
    def payload = JsonOutput.toJson([text      : text,
                                     channel   : '#team-chatter',
                                     username  : "jenkins",
                                     //token     : "IQtDjcb5cPCvPFfCGIfHTFBL",
                                     icon_emoji: ":robot_face:"])
    sh "curl -X POST --data-urlencode \'payload=${payload}\' ${slackURL}"
}
