import { Button } from "./ui";

export function HomeButton() {
  return (
    <Button onClick={() => (window.location.href = "/")}>
      Home
    </Button>
  );
}