import { Model } from "survey-core";
import { Survey } from "survey-react-ui";

const surveyJson = {
  title: "Patient Registration Form",
  description:
    "Your privacy is important to us. All information received through our forms and other communications is subject to our Patient Privacy Policy.",
  logo:
    "https://api.surveyjs.io/private/Surveys/files?name=09b0ee2a-d256-4376-b328-8be12d868f14",
  logoHeight: "96",
  completedHtml:
    '<div style="max-width:540px;text-align:left;margin:0 auto 16px auto;border:1px solid rgba(0,0,0,0.25);padding:40px 48px 48px;background:#fff;">' +
    "<h4>Thank you for completing your patient registration form.</h4><br>" +
    "<p>Dear {firstname-for-complete-page},<br>" +
    "Your information has been successfully received, and we look forward to providing you with the highest level of care." +
    "<br><br>If you have any questions or need to schedule an appointment, please don't hesitate to reach out to our office." +
    "<br><br>Warm regards,<br>Central Hospital.</p></div>",
  pages: [
    {
      name: "page1",
      elements: [
        {
          type: "panel",
          name: "personal-information",
          width: "69%",
          minWidth: "256px",
          elements: [
            {
              type: "text",
              name: "first-name",
              width: "50%",
              minWidth: "256px",
              title: "First Name",
              isRequired: true
            },
            {
              type: "text",
              name: "last-name",
              width: "50%",
              minWidth: "256px",
              startWithNewLine: false,
              title: "Last Name"
            }
          ]
        },
        {
          type: "text",
          name: "age",
          title: "Age",
          inputType: "number"
        }
      ]
    }
  ],
  calculatedValues: [
    {
      name: "firstname-for-complete-page",
      expression: "iif({first-name} notempty, {first-name}, 'patient')"
    }
  ],
  questionErrorLocation: "bottom",
  completeText: "Register",
  questionsOnPageMode: "singlePage",
  widthMode: "static",
  width: "1024",
  headerView: "advanced"
};

export default function App() {
  const model = new Model(surveyJson);

  // Falls du ein Theme-JSON für DefaultV2 hast UND Weg A benutzt:
  // import themeJson from "./theme.json";
  // model.applyTheme(themeJson);

  return <Survey model={model} />;
}
