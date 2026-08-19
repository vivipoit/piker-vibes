BRIGHT=$'\e[1m'
GREEN=$'\e[0;32m'
YELLOW=$'\e[0;33m'
CYAN=$'\e[0;36m'
WHITE=$'\e[0;37m'
NORMAL=$'\e[0m'
NEWLINE=$'\n'

source /usr/lib/git-core/git-sh-prompt

setopt PROMPT_SUBST
PS1='${BRIGHT}${GREEN}%m ${YELLOW}%~ ${CYAN}`__git_ps1 "(%s)"` ${BRIGHT}${WHITE}${NEWLINE}> ${NORMAL}'
