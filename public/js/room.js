document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('roomId');
    const username = localStorage.getItem('username');

    if (!username || !roomId) {
        window.location.href = '/';
        return;
    }

    document.getElementById('room-id-display').textContent = roomId;

    document.getElementById('copy-button').addEventListener('click', () => {
        navigator.clipboard.writeText(roomId).then(() => {
            alert('Room ID copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy room ID:', err);
        });
    });

    const editor = ace.edit("editor");
    editor.setTheme("ace/theme/monokai");
    editor.session.setMode("ace/mode/python");
    editor.setOptions({
        wrap: true,
        fontSize: "14px"
    });

    const output = document.getElementById('output');

    let userColor;
    const cursors = {};

    socket.emit('join room', { roomId, username });

    socket.on('room error', (message) => {
        alert(message);
        window.location.href = '/';
    });

    socket.on('initial code', (code) => {
        editor.setValue(code, -1);
    });

    socket.on('user color', (color) => {
        userColor = color;
    });

    let isRemoteChange = false;
    let lastTypingEmit = 0;

    editor.session.on('change', (delta) => {
        if (isRemoteChange) return;

        const code = editor.getValue();
        const cursor = editor.selection.getCursor();
        socket.emit('code change', { roomId, code, cursor });

        const now = Date.now();
        if (now - lastTypingEmit > 1000) {
            socket.emit('typing', { roomId, isTyping: true });
            lastTypingEmit = now;

            setTimeout(() => {
                socket.emit('typing', { roomId, isTyping: false });
            }, 2000);
        }
    });

    editor.session.selection.on('changeCursor', () => {
        const cursor = editor.selection.getCursor();
        socket.emit('cursor move', { roomId, cursor });
    });

    socket.on('code update', ({ code, userId, cursor }) => {
        isRemoteChange = true;
        const currentCursor = editor.selection.getCursor();
        editor.setValue(code, -1);
        editor.selection.moveTo(currentCursor.row, currentCursor.column);
        updateRemoteCursor(userId, cursor);
        isRemoteChange = false;
    });

    socket.on('cursor update', ({ userId, cursor }) => {
        updateRemoteCursor(userId, cursor);
    });

    function updateRemoteCursor(userId, cursor) {
        if (!cursors[userId]) {
            cursors[userId] = {
                id: editor.session.addMarker(
                    new ace.Range(0, 0, 0, 0),
                    "remote-cursor",
                    "text",
                    true
                ),
                color: null
            };
        }

        const user = Array.from(document.querySelectorAll('.user'))
            .find(el => el.id === `user-${userId}`);

        if (user) {
            cursors[userId].color = user.style.color;
        }

        const range = new ace.Range(cursor.row, cursor.column, cursor.row, cursor.column + 1);
        editor.session.removeMarker(cursors[userId].id);
        cursors[userId].id = editor.session.addMarker(range, "remote-cursor", "text", true);

        // Update the CSS for this specific cursor
        const cursorElements = document.querySelectorAll(`.remote-cursor-${userId}`);
        cursorElements.forEach(el => {
            el.style.borderLeftColor = cursors[userId].color;
            el.style.borderLeftWidth = '2px';
            el.style.borderLeftStyle = 'solid';
            el.style.position = 'absolute';
            el.style.pointerEvents = 'none';
        });
    }

    socket.on('user list', (users) => {
        updateUserList(users);
    });

    socket.on('user typing', ({ userId, isTyping }) => {
        updateUserTypingStatus(userId, isTyping);
    });

    socket.on('user disconnected', (userId) => {
        if (cursors[userId]) {
            editor.session.removeMarker(cursors[userId].id);
            delete cursors[userId];
        }
    });

    function updateUserList(users) {
        const userList = document.getElementById('user-list');
        userList.innerHTML = '';
        users.forEach((user, index) => {
            const userElement = document.createElement('span');
            userElement.textContent = user.username;
            userElement.id = `user-${user.id}`;
            userElement.classList.add('user');
            userElement.style.color = user.color;
            userList.appendChild(userElement);

            if (!cursors[user.id]) {
                cursors[user.id] = { color: user.color };
            }

            if (index < users.length - 1) {
                const comma = document.createTextNode(', ');
                userList.appendChild(comma);
            }
        });
    }

    function updateUserTypingStatus(userId, isTyping) {
        const userElement = document.getElementById(`user-${userId}`);
        if (userElement) {
            userElement.classList.toggle('typing', isTyping);
        }
    }

    // Add this CSS to your document
    const style = document.createElement('style');
    style.textContent = `
        .remote-cursor {
            position: absolute;
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);

    let pyodide;

    async function initializePyodide() {
        pyodide = await loadPyodide();
        await pyodide.loadPackage("micropip");
        const micropip = pyodide.pyimport("micropip");
        await micropip.install('ansi2html');
        console.log("Pyodide loaded successfully");

        // Set up custom print function
        pyodide.runPython(`
import sys
from io import StringIO
from ansi2html import Ansi2HTMLConverter

class ANSIOutputCollector(StringIO):
    def __init__(self):
        super().__init__()
        self.conv = Ansi2HTMLConverter()

    def write(self, s):
        super().write(s)

    def getvalue(self):
        return self.conv.convert(super().getvalue())

sys.stdout = ANSIOutputCollector()
sys.stderr = ANSIOutputCollector()

def custom_print(*args, **kwargs):
    print(*args, **kwargs, flush=True)

__builtins__.print = custom_print
        `);
    }

    initializePyodide();

    document.getElementById('run-button').addEventListener('click', async () => {
        const code = editor.getValue();
        await runCode(code);
    });

    async function runCode(code) {
        output.innerHTML = '';  // Clear previous output safely

        if (!pyodide) {
            output.textContent = 'Pyodide is still loading. Please wait and try again.';
            return;
        }

        try {
            // Reset stdout and stderr
            pyodide.runPython(`
import sys
sys.stdout = ANSIOutputCollector()
sys.stderr = ANSIOutputCollector()
            `);

            // Run the user's code
            await pyodide.runPythonAsync(code);

            // Get the output
            const stdout = pyodide.runPython("sys.stdout.getvalue()");
            const stderr = pyodide.runPython("sys.stderr.getvalue()");

            if (stdout) {
                const stdoutElement = document.createElement('div');
                stdoutElement.innerHTML = stdout;
                output.appendChild(stdoutElement);
            }

            if (stderr) {
                const stderrElement = document.createElement('div');
                stderrElement.innerHTML = stderr;
                output.appendChild(stderrElement);
            }
        } catch (error) {
            const errorElement = document.createElement('pre');
            errorElement.style.color = 'red';
            errorElement.textContent = `Error: ${error.message}`;
            output.appendChild(errorElement);
        }
    }
});