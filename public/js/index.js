document.addEventListener('DOMContentLoaded', () => {
  const createRoomButton = document.getElementById('create-room');
  const joinRoomButton = document.getElementById('join-room');
  const usernameInput = document.getElementById('username');
  const roomIdInput = document.getElementById('room-id');

  createRoomButton.addEventListener('click', async () => {
      const username = usernameInput.value.trim();
      if (!username) {
          alert('Please enter a username.');
          return;
      }

      try {
          const response = await fetch('/api/create-room', { method: 'POST' });
          const data = await response.json();
          localStorage.setItem('username', username);
          window.location.href = `/room?roomId=${data.roomId}`;
      } catch (error) {
          console.error('Error creating room:', error);
          alert('Failed to create room. Please try again.');
      }
  });

  joinRoomButton.addEventListener('click', async () => {
      const username = usernameInput.value.trim();
      const roomId = roomIdInput.value.trim();

      if (!username) {
          alert('Please enter a username.');
          return;
      }

      if (!roomId) {
          alert('Please enter a room ID.');
          return;
      }

      try {
          const response = await fetch(`/api/room-exists/${roomId}`);
          const data = await response.json();
          if (data.exists) {
              localStorage.setItem('username', username);
              window.location.href = `/room?roomId=${roomId}`;
          } else {
              alert('Room does not exist. Please check the room ID and try again.');
          }
      } catch (error) {
          console.error('Error checking room:', error);
          alert('Failed to join room. Please try again.');
      }
  });
});