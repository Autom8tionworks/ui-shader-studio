import "./style.css";
import { App } from "./ui/app";

function boot(): void {
  try {
    const app = new App();
    const exportBtn = document.getElementById("btn-export");
    if (exportBtn) exportBtn.addEventListener("click", () => app.exportPNG());
  } catch (err) {
    const stage = document.getElementById("stage");
    if (stage) {
      stage.innerHTML = `<div style="color:#fff;padding:24px;font:14px system-ui">
        <b>Could not start Shader Studio.</b><br><br>${(err as Error).message}
      </div>`;
    }
    console.error(err);
  }
}

boot();
