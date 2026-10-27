import { CompanionChat } from '@/components/companion/CompanionChat';
import { Container } from '@medusajs/ui';

// WI-OI-120bc (Giga AI Companion): the full-page surface. The same chat is also available as a floating launcher on
// every page (mounted in the app shell when the local model is configured).
export default function CompanionPage() {
  return (
    <Container className="m-6 flex max-w-2xl flex-col p-6">
      <CompanionChat />
    </Container>
  );
}
