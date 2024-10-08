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
  
    const output = document.getElementById('output');
  
    socket.emit('join room', { roomId, username });
  
    socket.on('room error', (message) => {
        alert(message);
        window.location.href = '/';
    });
  
    socket.on('initial code', (code) => {
        editor.setValue(code, -1);
    });
  
    let isRemoteChange = false;
    let lastTypingEmit = 0;
  
    editor.session.on('change', (delta) => {
        if (isRemoteChange) return;
  
        socket.emit('code change', { roomId, delta });
  
        const now = Date.now();
        if (now - lastTypingEmit > 1000) {
            socket.emit('typing', { roomId, isTyping: true });
            lastTypingEmit = now;
  
            setTimeout(() => {
                socket.emit('typing', { roomId, isTyping: false });
            }, 2000);
        }
    });
  
    socket.on('code update', ({ delta, userId }) => {
        isRemoteChange = true;
        editor.session.getDocument().applyDeltas([delta]);
        isRemoteChange = false;
    });
  
    socket.on('user list', (users) => {
        updateUserList(users);
    });
  
    socket.on('user typing', ({ userId, isTyping }) => {
        updateUserTypingStatus(userId, isTyping);
    });
  
    function updateUserList(users) {
        const userList = document.getElementById('user-list');
        userList.innerHTML = '';
        users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.textContent = user.username;
            userElement.id = `user-${user.id}`;
            userList.appendChild(userElement);
        });
    }
  
    function updateUserTypingStatus(userId, isTyping) {
        const userElement = document.getElementById(`user-${userId}`);
        if (userElement) {
            userElement.classList.toggle('typing', isTyping);
        }
    }
  
    let pyodide;
  
    async function initializePyodide() {
        pyodide = await loadPyodide();
        console.log("Pyodide loaded successfully");
    }
  
    initializePyodide();
  
    document.getElementById('run-button').addEventListener('click', async () => {
        const code = editor.getValue();
        await runCode(code);
    });
  
    async function runCode(code) {
        output.textContent = '';  // Clear previous output safely
  
        if (!pyodide) {
            output.textContent = 'Pyodide is still loading. Please wait and try again.';
            return;
        }
  
        try {
            pyodide.runPython(`
  import sys
  import io
  
  sys.stdout = io.StringIO()
  sys.stderr = io.StringIO()
            `);
  
            await pyodide.runPythonAsync(code);
  
            const stdout = pyodide.runPython("sys.stdout.getvalue()");
            const stderr = pyodide.runPython("sys.stderr.getvalue()");
  
            if (stdout) {
                const stdoutElement = document.createElement('pre');
                stdoutElement.textContent = stdout;
                output.appendChild(stdoutElement);
            }
  
            if (stderr) {
                const stderrElement = document.createElement('pre');
                stderrElement.style.color = 'red';
                stderrElement.textContent = stderr;
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