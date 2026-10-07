// Pure decision rules for the JD review. Keep the UI and the search generator
// aligned: every automatic role, skill set and location needs an explicit vote.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RadarReview = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function pendingQuestions(result) {
    const accepted = result.reviewAccepted || {};
    const quality = result.quality || {};
    if (result.isResume || quality.blocked) return [];
    return [
      quality.requiresSourceReview && !accepted.source ? "source" : null,
      !result.isJobPosting && !result.isResume && !result.isBrief ? "intent" : null,
      !accepted.role ? "role" : null,
      !accepted.requirements ? "requirements" : null,
      !accepted.location ? "location" : null,
    ].filter(Boolean);
  }

  function profileIssue(result) {
    const roles = result.rol || [];
    const skills = [...(result.imprescindibles || []), ...(result.atributos || []), ...(result.atributosDeseables || [])];
    const domains = result.dominio || [];
    if (!roles.length && skills.length < 2) return "Sin título, agregá al menos dos habilidades, tareas o experiencias concretas.";
    if (!roles.length && !domains.length && skills.length < 3) return "Sin título, agregá el sector o una tercera señal específica para distinguir el perfil.";
    if (roles.length && !skills.length) return "Agregá al menos una habilidad, tarea clave o experiencia que diferencie el puesto.";
    return "";
  }

  function canApply(result) {
    return !!result && !!(result.isJobPosting || result.isBrief) && !result.isResume &&
      !(result.quality && result.quality.blocked) &&
      pendingQuestions(result).length === 0 &&
      !profileIssue(result);
  }

  function accept(result, question) {
    result.reviewAccepted = { ...(result.reviewAccepted || {}), [question]: true };
    return result;
  }

  return { pendingQuestions, profileIssue, canApply, accept };
});
