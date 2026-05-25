import { Button } from "./ui";
import { useTranslation } from '../i18n/useTranslation';

export function HomeButton() {
  const { t } = useTranslation();

  return (
    <Button onClick={() => (window.location.href = "/")}>
      {t('hostLobby.goToHome')}
    </Button>
  );
}