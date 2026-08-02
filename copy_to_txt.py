import os
import shutil
import tkinter as tk
from tkinter import filedialog, messagebox
import json

CONFIG_FILE = "last_copy.json"

def load_previous_config():
    """Loads the previous file and folder selections if they exist."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Could not read config file: {e}")
    return None

def save_current_config(files, dest):
    """Saves the current file and folder selections for next time."""
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump({"files": files, "dest": dest}, f)
    except Exception as e:
        print(f"Could not save config file: {e}")

def execute_copy(files_to_copy, dest_dir):
    """Handles the actual copying and renaming process."""
    success_count = 0
    
    for file_path in files_to_copy:
        try:
            original_name = os.path.basename(file_path)
            name_without_ext = os.path.splitext(original_name)[0]
            new_name = f"{name_without_ext}.txt"
            dest_path = os.path.join(dest_dir, new_name)

            shutil.copy2(file_path, dest_path)
            success_count += 1
            print(f"Copied: {original_name} -> {new_name}")
            
        except Exception as e:
            print(f"Error copying {file_path}: {e}")

    messagebox.showinfo("Task Complete", f"Successfully processed {success_count} files.")

def main():
    # Initialize tkinter but hide the main window
    root = tk.Tk()
    root.withdraw()

    # 1. Check for previous configuration
    prev_config = load_previous_config()
    
    if prev_config and prev_config.get("files") and prev_config.get("dest"):
        file_count = len(prev_config["files"])
        dest = prev_config["dest"]
        
        # Ask the user if they want to repeat the last action
        repeat = messagebox.askyesno(
            "Repeat Last Copy?",
            f"Do you want to repeat the last operation?\n\n"
            f"Destination: {dest}\n"
            f"Files to copy: {file_count} file(s)"
        )
        
        if repeat:
            print("Repeating previous copy operation...")
            execute_copy(prev_config["files"], prev_config["dest"])
            return # Exit after repeating

    # 2. If no previous config, or user chose "No", prompt for new selections
    files_to_copy = filedialog.askopenfilenames(
        title="Select files to copy",
        filetypes=[("All Files", "*.*")]
    )

    if not files_to_copy:
        print("No files selected. Exiting.")
        return

    dest_dir = filedialog.askdirectory(title="Select Destination Folder")

    if not dest_dir:
        print("No destination folder selected. Exiting.")
        return

    # 3. Save these new selections for the next time the script runs
    save_current_config(files_to_copy, dest_dir)

    # 4. Execute the copy
    execute_copy(files_to_copy, dest_dir)

if __name__ == "__main__":
    main()