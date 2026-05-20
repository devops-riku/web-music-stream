import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css'
import './index.css'
import App from './App.jsx'
import { createTheme, MantineProvider } from '@mantine/core'

const theme = createTheme({
  primaryColor: 'spotifyGreen',
  colors: {
    spotifyGreen: [
      '#eefcf2',
      '#d7f7e1',
      '#aff0c3',
      '#82e7a2',
      '#5cdc83',
      '#41d46d',
      '#2fcb60',
      '#1db954', // Spotify Green
      '#13a246',
      '#058c39'
    ]
  },
  defaultRadius: 'md'
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
)
