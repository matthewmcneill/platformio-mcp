---
description: Add a new item to the project .agents/todo_list.md list
---

When the user uses the `/todo` command:

- **If followed by text**:
    1. Analyze the text provided by the user and determine the most relevant section of `.agents/todo_list.md` to append it to (e.g. `### Web Portal & UI`, `### Firmware & Architecture`, `### Diagnostics & Testing`, `### Data Providers & Scheduling`). 
    2. If it does not neatly fit into one of the domain-specific categories, use the `### Uncategorized / Other` section.
    3. Use the `replace_file_content` or `multi_replace_file_content` tool to insert `- [ ] <text provided by the user>` at the end of the chosen section (just before the next section header).
    4. If `.agents/todo_list.md` does not exist, create it with standard grouped headers first.
    5. Notify the user that the item has been added and specify which section it was assigned to.

- **If NOT followed by text**:
    1. Open the `.agents/todo_list.md` file using the `view_file` tool to read the current state of the file.
    2. Respond to the user with a formatted markdown output showing the structured list.
    3. If the file doesn't exist, notify the user.