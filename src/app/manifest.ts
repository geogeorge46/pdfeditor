import type { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Offline PDF Editor Pro',
    short_name: 'PDF Editor',
    description: 'Privacy-first, offline-ready PDF Editor application.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
  }
}
