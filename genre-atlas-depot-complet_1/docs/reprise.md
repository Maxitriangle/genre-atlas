# Reprise — état au 21/09/2026

Le site de Maxime tourne avec l'extension v0.1.1, installée par zip, sans mécanisme de mise à jour.
Ce dépôt contient la v0.2.0, qui ajoute la mise à jour automatique depuis les releases GitHub. Elle n'a encore jamais été publiée.

## À faire, dans l'ordre
1. Si `.github/workflows/release.yml` est absent du dépôt, le créer à partir de `docs/release-workflow.yml.txt` (les dossiers cachés ne passent pas par un dépôt manuel depuis le Finder).
2. Créer le tag `v0.2.0` et vérifier que la release contient bien `genre-atlas.zip`. Si l'envoi du fichier de workflow est refusé (droit « workflows » manquant), publier la release autrement et le signaler à Maxime.
3. Faire installer à Maxime la v0.2.0 une dernière fois par zip : Extensions → Ajouter une extension → Téléverser → « Remplacer l'actuelle par la version téléversée ».
4. Valider la chaîne : publier une v0.2.1 minime et vérifier avec lui qu'elle apparaît dans Extensions. Lui proposer d'activer les mises à jour automatiques de l'extension.
