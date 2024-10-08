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
      editor.setValue(code);
  });

  let isRemoteChange = false;

  editor.session.on('change', () => {
      if (isRemoteChange) return;
      const code = editor.getValue();
      socket.emit('code change', { roomId, code });
  });

  socket.on('code update', (code) => {
      isRemoteChange = true;
      const cursorPosition = editor.getCursorPosition();
      editor.setValue(code, -1);
      editor.moveCursorToPosition(cursorPosition);
      isRemoteChange = false;
  });

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