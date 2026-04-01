
export const getDirectDriveUrl = (url: string) => {
  if (!url) return '';
  // Basic Google Drive direct link converter
  if (url.includes('drive.google.com')) {
    const id = url.split('/d/')[1]?.split('/')[0] || url.split('id=')[1]?.split('&')[0];
    if (id) return `https://lh3.googleusercontent.com/d/${id}`;
  }
  return url;
};
