import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "https://your-backend.com";

export const getUser = (userId) => axios.get(`${API_BASE}/api/user/${userId}`);
export const startTrial = (userId) =>
  axios.post(`${API_BASE}/api/start-trial`, { userId });
export const activatePackage = (userId, pkg) =>
  axios.post(`${API_BASE}/api/activate`, { userId, package: pkg });
export const chat = (payload) => axios.post(`${API_BASE}/api/chat`, payload);
export const uploadImage = (formData) => axios.post(`${API_BASE}/api/upload`, formData);
