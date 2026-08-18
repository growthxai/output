export const Role = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool'
};
export const isRole = role => msg => msg.role === role;
export const getContent = msg => msg.content;
