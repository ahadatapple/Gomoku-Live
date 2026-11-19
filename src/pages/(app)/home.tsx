/** /home is the platform's post-sign-in landing; the app lives at /play. */
import { Navigate } from 'react-router-dom'

export default function HomePage() {
  return <Navigate to="/play" replace />
}
