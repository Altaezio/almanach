import os
import json

AlmanachsLocation = "./Almanachs"
ParsedDestination = "./BotDiscord/data"

# parse almanachs
for fileInd,fileName in enumerate(os.listdir(AlmanachsLocation)):
    if not fileName.endswith(".txt"):
        continue
    with open(AlmanachsLocation + "/" + fileName, mode="r", encoding="utf-8") as text:
        data = {}
        days = []
        day = {}

        state = "header"
        for lineInd,line in enumerate(text):
            line = line.strip()
            if len(line) == 0:
                if state != "header":
                    days.append(day)
            
            if state == "header":
                if line.startswith("Titre: "):
                    data["title"] = line.split(": ")[1]
                elif line.startswith("Édition: "):
                    data["editor"] = line.split(": ")[1]
                elif line.startswith("Note: "):
                    data["note"] = line.split(": ")[1]
                else:
                    state = "newDay"
            else:
                if line.startswith("=="):
                    state = "newDay"
                    day = {}
                    day["almanachName"] = data["title"]
                    day["almanachFile"] = fileName
                    day["line"] = lineInd
                elif state == "newDay":
                    day["id"] = int(str(fileInd) + line[3:] + line[:2])
                    day["date"] = line
                    day["type"] = "text"
                    state = "dayTextFirstLine"
                elif state == "dayTextFirstLine":
                    day["text"] = line
                    state = "dayText"
                elif state == "dayText":
                    if line.startswith("~"):
                        day["type"] = "citation"
                        day["author"] = line
                    elif line.startswith(">"):
                        day["type"] = "enigma"
                        day["answer"] = line
                        state == "dayAnswer"
                    else:
                        day["text"] += '\n' + line
                elif state == "dayAnswer":
                    day["answer"] += '\n' + line

        data["days"] = days
        print(f"{len(days)} days in {fileName[:-4]}")
            
        
        jsonName = fileName[:-3] + "json"
        with open(ParsedDestination + "/" + jsonName, mode="w", encoding="utf-8") as jsonFile:
            json.dump(data, jsonFile, ensure_ascii=False, indent=2)
