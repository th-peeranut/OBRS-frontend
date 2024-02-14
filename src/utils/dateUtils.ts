export const generateCurrentTime = (): string => {
  const date: Date = new Date();
  const year: string = date.getFullYear().toString();
  const month: string = (date.getMonth() + 1).toString().padStart(2, '0');
  const day: string = date.getDate().toString().padStart(2, '0');
  const hours: string = date.getHours().toString().padStart(2, '0');
  const minutes: string = date.getMinutes().toString().padStart(2, '0');
  const seconds: string = date.getSeconds().toString().padStart(2, '0');
  const timezoneOffset: number = date.getTimezoneOffset();
  const timezoneOffsetHours: string = Math.abs(Math.floor(timezoneOffset / 60)).toString().padStart(2, '0');
  const timezoneOffsetMinutes: string = Math.abs(timezoneOffset % 60).toString().padStart(2, '0');
  const timezoneSign: string = timezoneOffset >= 0 ? '-' : '+';

  return `${year}${month}${day}${hours}${minutes}${seconds}${timezoneSign}${timezoneOffsetHours}${timezoneOffsetMinutes}`;
}