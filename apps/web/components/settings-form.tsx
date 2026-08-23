import { updateGymSettingsAction } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";

type Settings = {
  displayName: string | null;
  aiDisplayName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  defaultLanguage: string;
  requireTrainerApprovalForNutritionChanges: boolean;
  requireTrainerApprovalForWorkoutChanges: boolean;
  allowAutomaticProgressRecommendations: boolean;
  trainingPhilosophy: string | null;
  defaultSessionMinutes: number | null;
  welcomeMessage: string | null;
} | null;

function safeColor(value: string | null | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export function GymSettingsEditor({ gymId, gymName, returnTo, settings }: { gymId: string; gymName: string; returnTo: string; settings: Settings }) {
  const primary = safeColor(settings?.primaryColor, "#176b68");
  const secondary = safeColor(settings?.secondaryColor, "#e4a24c");
  return <div className="settings-layout">
    <form className="panel panel-body settings-form" action={updateGymSettingsAction.bind(null, returnTo, gymId)}>
      <div className="form-grid">
        <div className="field"><label htmlFor="displayName">Display name</label><input id="displayName" name="displayName" defaultValue={settings?.displayName ?? gymName} maxLength={120} /></div>
        <div className="field"><label htmlFor="aiDisplayName">AI coach name</label><input id="aiDisplayName" name="aiDisplayName" defaultValue={settings?.aiDisplayName ?? ""} maxLength={120} /></div>
        <div className="field"><label htmlFor="primaryColor">Primary color</label><input id="primaryColor" name="primaryColor" type="color" defaultValue={primary} /></div>
        <div className="field"><label htmlFor="secondaryColor">Secondary color</label><input id="secondaryColor" name="secondaryColor" type="color" defaultValue={secondary} /></div>
        <div className="field"><label htmlFor="defaultLanguage">Language</label><select id="defaultLanguage" name="defaultLanguage" defaultValue={settings?.defaultLanguage ?? "ar-IQ"}><option value="ar-IQ">Arabic (Iraq)</option><option value="en">English</option></select></div>
        <div className="field"><label htmlFor="defaultSessionMinutes">Default session minutes</label><input id="defaultSessionMinutes" name="defaultSessionMinutes" type="number" min={20} max={180} defaultValue={settings?.defaultSessionMinutes ?? ""} /></div>
      </div>
      <div className="field"><label htmlFor="trainingPhilosophy">Training philosophy</label><textarea id="trainingPhilosophy" name="trainingPhilosophy" maxLength={2000} defaultValue={settings?.trainingPhilosophy ?? ""} /></div>
      <div className="field"><label htmlFor="welcomeMessage">Welcome message</label><textarea id="welcomeMessage" name="welcomeMessage" maxLength={1000} defaultValue={settings?.welcomeMessage ?? ""} /></div>
      <div className="checkbox"><input id="nutritionApproval" name="requireTrainerApprovalForNutritionChanges" type="checkbox" defaultChecked={settings?.requireTrainerApprovalForNutritionChanges ?? true} /><label htmlFor="nutritionApproval">Require trainer approval for nutrition changes</label></div>
      <div className="checkbox"><input id="workoutApproval" name="requireTrainerApprovalForWorkoutChanges" type="checkbox" defaultChecked={settings?.requireTrainerApprovalForWorkoutChanges ?? true} /><label htmlFor="workoutApproval">Require trainer approval for workout changes</label></div>
      <div className="checkbox"><input id="automaticProgress" name="allowAutomaticProgressRecommendations" type="checkbox" defaultChecked={settings?.allowAutomaticProgressRecommendations ?? true} /><label htmlFor="automaticProgress">Allow automatic progress recommendations</label></div>
      <ConfirmButton message="Save these tenant settings?">Save settings</ConfirmButton>
    </form>
    <aside className="brand-preview" style={{ background: `linear-gradient(145deg, ${primary}, ${secondary})` }}>
      <div className="preview-logo">AI</div><h2>{settings?.displayName ?? gymName}</h2><p>{settings?.aiDisplayName ?? "AI Coach"}</p>
    </aside>
  </div>;
}
