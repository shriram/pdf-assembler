# PDF Assembler

## What it's for

A local web app for assembling multi-page PDF reports from a folder of
files. I designed it primarily for creating single-file trip reports
to submit for reimbursement, but there's no reason it can't be used
for any other purpose that requires stitching together PDFs. However,
note that it does not provide fine-grained PDF editing; that's not the
goal for this software, and I don't want to over-complicate it.

## How to run it

Run `make` for setup and usage instructions.

## What it does

Run it in a folder that contains your files. It will assemble a
listing of all the files that can be assembled in that folder. It
looks recursively into sub-folders and provides a list of all the
files in each sub-folder.

It recognizes several file formats including PDF, PNG, JPEG, Markdown,
and plain text.

If there are files named readme or cover, they are automatically
suggested for the final document, at the top.

## System dependencies

Requires Node.js 20+ and Google Chrome at the default macOS path.
To use a different Chrome: `CHROME_EXECUTABLE_PATH=/path/to/chrome ./run`

## Disclaimer

No warranties! I actually use this, but I cannot and don't guarantee
that it won't delete all your files *after* first uploading all your
personal data to a public pastebin that it creates a social media
account to advertise. Might also incur massive bills. You shouldn't
use this software at all!
