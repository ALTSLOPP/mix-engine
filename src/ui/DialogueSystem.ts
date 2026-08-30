export interface DialogueChoiceConfig {
  text: string;
  onClick: () => void;
}

export class DialogueSystem {
  private container: HTMLDivElement;
  private contentBox: HTMLDivElement;
  private speakerLabel: HTMLDivElement;
  private textDisplay: HTMLDivElement;
  private choicesContainer: HTMLDivElement;

  public onShow?: () => void;
  public onHide?: () => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      bottom: 5%;
      left: 10%;
      width: 80%;
      height: 30%;
      z-index: 10000;
      display: none;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      pointer-events: auto;
    `;
    
    this.contentBox = document.createElement('div');
    this.contentBox.style.cssText = `
      width: 100%;
      background: rgba(10, 15, 25, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
      color: white;
      font-family: system-ui, sans-serif;
    `;

    this.speakerLabel = document.createElement('div');
    this.speakerLabel.style.cssText = `
      font-size: 20px;
      font-weight: bold;
      color: #FFD700;
      margin-bottom: 8px;
    `;

    this.textDisplay = document.createElement('div');
    this.textDisplay.style.cssText = `
      font-size: 24px;
      line-height: 1.4;
      margin-bottom: 24px;
      min-height: 60px;
    `;

    this.choicesContainer = document.createElement('div');
    this.choicesContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
    `;

    this.contentBox.appendChild(this.speakerLabel);
    this.contentBox.appendChild(this.textDisplay);
    this.contentBox.appendChild(this.choicesContainer);
    this.container.appendChild(this.contentBox);
    document.body.appendChild(this.container);
  }

  public show(text: string, speaker?: string, choices?: DialogueChoiceConfig[]) {
    this.speakerLabel.innerText = speaker || '';
    this.speakerLabel.style.display = speaker ? 'block' : 'none';
    this.textDisplay.innerText = text;

    // Clear old choices
    this.choicesContainer.innerHTML = '';

    const activeChoices = choices && choices.length > 0 ? choices : [{ text: "Continue", onClick: () => {} }];

    for (const choice of activeChoices) {
      const btn = document.createElement('button');
      btn.innerText = `▶ ${choice.text}`;
      btn.style.cssText = `
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.8);
        font-size: 20px;
        cursor: pointer;
        padding: 4px 8px;
        text-align: left;
        transition: color 0.2s, transform 0.2s;
        font-family: system-ui, sans-serif;
      `;
      btn.onmouseover = () => {
        btn.style.color = '#fff';
        btn.style.transform = 'translateX(5px)';
      };
      btn.onmouseout = () => {
        btn.style.color = 'rgba(255, 255, 255, 0.8)';
        btn.style.transform = 'none';
      };
      btn.onclick = () => {
        this.hide();
        choice.onClick();
      };
      this.choicesContainer.appendChild(btn);
    }

    this.container.style.display = 'flex';
    if (this.onShow) this.onShow();
  }

  public hide() {
    this.container.style.display = 'none';
    if (this.onHide) this.onHide();
  }
}
