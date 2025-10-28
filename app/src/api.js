// app/src/api.js
import axios from "axios";

export const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://server-production-dd28.up.railway.app";

export const getUser = (userId) =>
  axios.get(`${API_BASE}/api/user/${encodeURIComponent(userId)}`);
export const startTrial = (userId) =>
  axios.post(`${API_BASE}/api/start-trial`, { userId });
export const activatePackage = (userId, pkg) =>
  axios.post(`${API_BASE}/api/activate`, { userId, package: pkg });
export const chat = (payload) => axios.post(`${API_BASE}/api/chat`, payload);
export const uploadImage = (formData) =>
  axios.post(`${API_BASE}/api/upload`, formData);

// new helper if you like, or you can fetch directly in Chat.jsx
export const fetchConversation = (userId, topic) =>
  axios.get(
    `${API_BASE}/api/conversation?userId=${encodeURIComponent(
      userId
    )}&topic=${encodeURIComponent(topic)}`
  );
