#!/bin/bash

type=${1:-$"error"}
title=${2:-$"<title>"}
message=${3:-$"<message>"}

color=$([[ $type == "error" ]] && echo "31" || echo "33" )
caption=$([[ $type == "error" ]] && echo "ERROR" || echo "WARNING" )

printf -v border '%*s' "${#caption}" ''

printf "\n\e[3;35;6m"
printf "╭─${border// /─}─╮\n"
printf "│\e[0;1;${color}m $caption\e[6;35m │\n"
printf "╰─${border// /─}─╯\n\e[0m"
printf "\e[1;${color}m\n${title}\e[0m\n\n"
printf "\e[3;38m${message}\e[0m\n\n"
